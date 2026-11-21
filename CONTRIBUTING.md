# 协作开发说明

## 本地启动

```powershell
python -m http.server 4173
```

打开 `http://localhost:4173`，按 README 的演示路径检查四步流程。

## 变更约定

- 前端行为集中在 `app.js`，样式集中在 `styles.css`。
- 不要提交真实音频、授权材料、私钥、RPC 密钥或 `.env` 文件。
- Monad 合约当前是字段草稿，部署前需要补充管理员权限、测试和审计。
- 提交前至少运行 `node --check app.js`，并在浏览器走一次完整验收链路。

## 分支建议

从 `main` 创建功能分支，例如 `feat/contract-adapter`，通过 Pull Request 合并。
