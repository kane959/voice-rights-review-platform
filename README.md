# 声证 / 音色授权与第三方审查平台

这是根据《音色授权与第三方审查平台-团队方案》落地的 MVP。它把方案里的四步流程接在同一份浏览器状态中，并已接入 Monad Testnet 的只读 RPC：

1. 配音员签发第一版或第二版授权；
2. 制作方选择台词版本，上传真实音频或载入仓库内的 TTS 演示音频，并计算 SHA-256 文件指纹；
3. 审核员试听具体音频，审核通过后生成回执；
4. 接收方用回执和另一份文件核验，直观看到“匹配 / 不匹配”。

链上配置位于 `monad-config.json`。当前演示合约已经部署，配置文件包含合约地址、部署交易、授权交易和审核交易。

## 运行

在此目录打开终端。要让页面按钮通过本地服务写入 Monad，使用：

```powershell
npm install
npm run dev
```

然后访问 <http://localhost:4173>。服务端只在本机读取 `.env` 私钥，浏览器不会接触私钥；授权和审核按钮会分别调用 `/api/authorization` 与 `/api/review`。

只做静态只读演示时，也可以使用：

```powershell
python -m http.server 4173
```

静态服务器没有 API，页面会保留本地演示流程，但不会把新的授权或审核写入链上。

## 演示路径

- 进入“授权确认”，默认是只覆盖第一版的授权。
- 进入“上传送审”，选择第二版并点击“正式送审”，页面会提示缺少匹配授权。
- 返回“授权确认”，签发第二版授权；再回到“上传送审”，载入演示音频并正式送审。
- 进入“机构审核”，试听 WAV 文件，通过后签发回执。
- 进入“独立核验”，分别点击“载入获批文件并核验”和“换成另一份文件”，观察匹配与不匹配结果。

## Monad 测试网部署

官方测试网参数：

- Chain ID：`10143`
- RPC：`https://testnet-rpc.monad.xyz`
- 浏览器：<https://testnet.monadvision.com>
- 水龙头：<https://faucet.monad.xyz>

安装依赖并复制本地配置：

```powershell
npm install
Copy-Item .env.example .env
```

在 `.env` 中填写专用测试钱包私钥（不要提交 `.env`），先检查 RPC：

```powershell
npm run chain:check
```

确认部署钱包有 MON 测试币后部署：

```powershell
npm run chain:deploy
```

部署脚本会编译 `contracts/VoiceRightsRegistry.sol`，把 ABI 写入 `artifacts/VoiceRightsRegistry.json`，部署合约，并更新 `monad-config.json` 中的合约地址、交易哈希和部署者地址。合约构造函数会把部署者设为管理员，并将 `REVIEWER_ADDRESS`（未填写时为部署者）设为审核员。

合约部署后，把更新后的 `monad-config.json` 和 `artifacts/VoiceRightsRegistry.json` 提交到 GitHub，队友启动静态页面即可读取链状态。

本次演示部署：

- 合约：`0x2C58E09Ec80503354B5b18D1F45223ACd7395e75`
- 部署交易：`0x6cd87818cc8520b2d4b0e31d614df2c5e11f90190997c79cc3f9264b0f1e9361`
- 授权登记交易：`0x0df89f6e14d1687c18f9fffd8022edd9dec5b9703ce774087729687894321890`
- 审核登记交易：`0xf12786a09ea59ac387902a85c3e8940746c03a790bfd0873b5102a6c883bc61b`

## 当前边界

- `assets/coffee-ad-v1-demo.wav` 和 `assets/coffee-ad-v2-demo.wav` 是通过 Windows TTS 生成的可播放演示音频，不是配音员真实录音。要完成真实授权验收，需要把它们替换成团队准备好的录音，并保留真实授权材料在链下。
- 公共 RPC 已配置并可读；本次使用的专用测试钱包私钥仅保存在部署机的 `.env`，没有进入 GitHub。部署脚本不会打印或上传私钥。
- 原始音频、台词正文和审核材料仅在浏览器内处理；生产版需要接入对象存储、身份认证、合约和审计日志。
