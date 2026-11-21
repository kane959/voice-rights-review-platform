using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

[assembly: AssemblyTitle("Voice Proof")]
[assembly: AssemblyProduct("Voice Proof")]

internal static class Launcher
{
    private const int Port = 41731;
    private const string Host = "127.0.0.1:41731";
    private const string Url = "http://" + Host + "/";
    private const string Title = "声证 / Voice Proof";
    private static readonly Dictionary<string, StaticAsset> Assets = LoadAssets();

    [STAThread]
    private static void Main(string[] args)
    {
        bool openOnLaunch = !args.Contains("--background");
        bool firstInstance;
        using (var instance = new Mutex(false, @"Local\VoiceProofDesktop", out firstInstance))
        {
            if (!firstInstance)
            {
                if (openOnLaunch) OpenBrowser();
                return;
            }

            var listener = new TcpListener(IPAddress.Loopback, Port);
            listener.ExclusiveAddressUse = true;
            try
            {
                listener.Start();
            }
            catch (SocketException)
            {
                MessageBox.Show("声证的本地端口 41731 已被占用。关闭占用端口的程序后，请重试。", Title,
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            try
            {
                Application.EnableVisualStyles();
                var serving = ServeAsync(listener);
                using (var icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath))
                using (var menu = new ContextMenuStrip())
                using (var tray = new NotifyIcon { Icon = icon, Text = Title, ContextMenuStrip = menu, Visible = true })
                {
                    menu.Items.Add("打开声证", null, (sender, eventArgs) => OpenBrowser());
                    menu.Items.Add("退出", null, (sender, eventArgs) => Application.ExitThread());
                    tray.DoubleClick += (sender, eventArgs) => OpenBrowser();
                    if (openOnLaunch) OpenBrowser();
                    Application.Run();
                }
                GC.KeepAlive(serving);
            }
            finally
            {
                listener.Stop();
            }
        }
    }

    private static void OpenBrowser()
    {
        try
        {
            Process.Start(new ProcessStartInfo(Url) { UseShellExecute = true });
        }
        catch (System.ComponentModel.Win32Exception)
        {
            MessageBox.Show("请在浏览器中打开 " + Url, Title, MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }

    private static Dictionary<string, StaticAsset> LoadAssets()
    {
        var assembly = Assembly.GetExecutingAssembly();
        return assembly.GetManifestResourceNames()
            .Where(name => name.StartsWith("web/", StringComparison.Ordinal))
            .ToDictionary(name => "/" + name.Substring(4), name =>
            {
                using (var stream = assembly.GetManifestResourceStream(name))
                using (var buffer = new MemoryStream())
                {
                    stream.CopyTo(buffer);
                    return new StaticAsset(name, buffer.ToArray());
                }
            }, StringComparer.Ordinal);
    }

    private static async Task ServeAsync(TcpListener listener)
    {
        var available = new SemaphoreSlim(24);
        while (true)
        {
            await available.WaitAsync().ConfigureAwait(false);
            TcpClient client;
            try
            {
                client = await listener.AcceptTcpClientAsync().ConfigureAwait(false);
            }
            catch (SocketException)
            {
                return;
            }
            catch (ObjectDisposedException)
            {
                return;
            }
            ThreadPool.QueueUserWorkItem(ignored => ServeClient(client, available));
        }
    }

    private static void ServeClient(TcpClient client, SemaphoreSlim available)
    {
        try
        {
            using (client)
            {
                client.ReceiveTimeout = 3500;
                client.SendTimeout = 3500;
                using (var stream = client.GetStream())
                {
                    var request = ReadHeaders(stream);
                    if (request == null) return;
                    var firstLine = request[0].Split(' ');
                    var hosts = request.Skip(1).Where(line => line.StartsWith("Host:", StringComparison.OrdinalIgnoreCase)).ToArray();
                    if (firstLine.Length != 3 || hosts.Length != 1 || hosts[0].Substring(5).Trim() != Host)
                    {
                        WriteResponse(stream, "400 Bad Request", null, false);
                        return;
                    }
                    bool head = firstLine[0] == "HEAD";
                    if (!head && firstLine[0] != "GET")
                    {
                        WriteResponse(stream, "405 Method Not Allowed", null, false);
                        return;
                    }
                    string route = firstLine[1].Split('?')[0];
                    StaticAsset asset;
                    Assets.TryGetValue(route == "/" ? "/index.html" : route, out asset);
                    WriteResponse(stream, asset == null ? "404 Not Found" : "200 OK", asset, head);
                }
            }
        }
        catch (IOException)
        {
        }
        catch (SocketException)
        {
        }
        finally
        {
            available.Release();
        }
    }

    private static string[] ReadHeaders(Stream stream)
    {
        var bytes = new byte[16384];
        int length = 0;
        var timer = Stopwatch.StartNew();
        while (length < bytes.Length && timer.ElapsedMilliseconds < 3500)
        {
            int read = stream.Read(bytes, length, bytes.Length - length);
            if (read == 0) return null;
            int start = Math.Max(0, length - 3);
            length += read;
            for (int offset = start; offset + 3 < length; offset++)
            {
                if (bytes[offset] == 13 && bytes[offset + 1] == 10 && bytes[offset + 2] == 13 && bytes[offset + 3] == 10)
                    return Encoding.ASCII.GetString(bytes, 0, offset).Split(new[] { "\r\n" }, StringSplitOptions.None);
            }
        }
        return null;
    }

    private static void WriteResponse(Stream stream, string status, StaticAsset asset, bool head)
    {
        string type = asset == null ? "text/plain; charset=utf-8" : asset.ContentType;
        int length = asset == null ? 0 : asset.Body.Length;
        var headers = Encoding.ASCII.GetBytes(
            "HTTP/1.1 " + status + "\r\nContent-Type: " + type + "\r\nContent-Length: " + length +
            "\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff" +
            "\r\nContent-Security-Policy: frame-ancestors 'none'; base-uri 'none'\r\n\r\n");
        stream.Write(headers, 0, headers.Length);
        if (!head && asset != null) stream.Write(asset.Body, 0, length);
    }

    private sealed class StaticAsset
    {
        public readonly byte[] Body;
        public readonly string ContentType;

        public StaticAsset(string name, byte[] body)
        {
            Body = body;
            switch (Path.GetExtension(name))
            {
                case ".html": ContentType = "text/html; charset=utf-8"; break;
                case ".js": ContentType = "text/javascript; charset=utf-8"; break;
                case ".css": ContentType = "text/css; charset=utf-8"; break;
                case ".webp": ContentType = "image/webp"; break;
                default: throw new InvalidOperationException("Unsupported asset: " + name);
            }
        }
    }
}
