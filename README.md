# 声证 / 音色授权与第三方审查平台

声证把音色授权、成品送审、第三方审核和交付核验串成一条可交接的流程。系统核对授权范围、钱包身份和音频 SHA-256 指纹，原始音频只在参与方浏览器中处理。

## 在线展示

- 公网演示：<https://kane959.github.io/voice-rights-review-platform/>
- GitHub 仓库：<https://github.com/kane959/voice-rights-review-platform>
- Windows 便携版：见仓库 Releases

打开公网演示后会先进入「角色大厅」，可选择配音员、制作方、第三方审核员或接收方。默认是浏览器本地演示账本；在右上角「本地演示」中打开网络配置，可以连接 Monad 测试网合约。

## 本地演示

```powershell
npm ci
npm run dev
```

打开 <http://127.0.0.1:4173/>。也可以从角色大厅选择一个角色，沿着「签发授权 → 上传送审 → 第三方审查 → 独立核验」交接。记录保存在浏览器本地账本，音频保存在 IndexedDB。

1. 配音员签发授权，填写制作方、项目、台词版本、台词正文和用途。
2. 制作方导入授权单，上传成品；系统核对提交方、授权范围并登记文件指纹。
3. 审核员导入送审单和原始音频，试听并决定通过或驳回；通过后签发交付回执。
4. 接收方导入回执和收到的音频，核对授权状态、审核决定和文件指纹。换一份音频可看到不匹配结果。

演示样音是合成提示声。需要判断真实台词和用途时，请使用实际录音文件。

## Monad 测试网

- 网络：Monad Testnet
- Chain ID：`10143`
- RPC：`https://testnet-rpc.monad.xyz`
- 当前演示合约：`0x85eB82304D36dC2bA1A256359107E5d8D104B085`
- 部署交易：`0x0193ca8a15664460fe19e518cb4ab1923749491df7f836cd99a50a11bc5bb940`

页面默认显示本地演示。连接链上模式时，在网络配置中确认合约地址和 RPC，再连接支持 Monad 测试网的钱包。读取授权、送审和审核记录不需要钱包；签发、送审、撤销和审核写入需要钱包签名。

部署工具：

```powershell
Copy-Item .env.example .env
# 在 .env 中填写本地私钥和审核员地址
npm run chain:check
npm run chain:deploy
```

私钥只放在本地 `.env`，不会提交到仓库。

## Windows 便携版

安装 Node.js 依赖后，在 Windows 上使用 Python 3.11 重新打包：

```powershell
npm ci
py -3.11 packaging/windows/build.py --portable
```

生成的 ZIP 会包含启动器、角色大厅静态资源、`ethers` 浏览器依赖和源码。启动器只监听本机回环地址 `127.0.0.1:41731`。

## 项目结构

- `app.js`、`styles.css`、`role-portraits.webp`：角色大厅和四步工作流界面
- `registry.js`：本地账本、Monad RPC 读取和钱包写入
- `audio.js`：IndexedDB 音频存储与 SHA-256 指纹
- `contracts/VoiceRightsRegistry.sol`：授权、送审、审核和撤销合约
- `scripts/check-chain.mjs`、`scripts/deploy.mjs`：链检查和部署
- `packaging/windows/`：Windows 便携启动器构建脚本
- `.github/workflows/pages.yml`：GitHub Pages 构建与部署
