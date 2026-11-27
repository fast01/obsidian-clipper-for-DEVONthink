#!/usr/bin/env bash
# 构建改造后的 obsidian-clipper（默认输出目标：DEVONthink）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${SCRIPT_DIR}"
DIST="${REPO}/dist"
# Optional: set EDGE_DIR to a browser "Load unpacked" directory to auto-sync
# the build there. Unset by default so the script stays machine-independent.
EDGE_DIR="${EDGE_DIR:-}"
SKIP_INSTALL=0
DO_SYNC=1

usage() {
	cat <<'EOF'
用法: ./build.sh [--no-install] [--help]

  --no-install   跳过 npm ci（依赖已存在时加快构建）
  --no-sync      不同步到浏览器加载目录
  --help         显示本帮助

环境变量:
  EDGE_DIR       若设置，构建后把 dist/ 覆盖同步到该目录（浏览器"加载已解压的扩展程序"用的目录）

产物:
  dist/                    可直接加载的扩展目录
  builds/*-chrome.zip      打包好的扩展压缩包
EOF
}

for arg in "$@"; do
	case "${arg}" in
		--no-install) SKIP_INSTALL=1 ;;
		--no-sync) DO_SYNC=0 ;;
		-h|--help) usage; exit 0 ;;
		*) echo "未知参数: ${arg}" >&2; usage >&2; exit 2 ;;
	esac
done

if [ ! -d "${REPO}" ]; then
	echo "找不到仓库目录: ${REPO}" >&2
	exit 1
fi
if ! command -v node >/dev/null 2>&1; then
	echo "找不到 node，请先安装 Node.js" >&2
	exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
	echo "找不到 npm，请先安装 Node.js" >&2
	exit 1
fi

echo "==> Node $(node --version), npm $(npm --version)"

if [ "${SKIP_INSTALL}" -eq 0 ]; then
	if [ ! -d "${REPO}/node_modules" ]; then
		echo "==> 首次构建，安装依赖 (npm ci)"
		(cd "${REPO}" && npm ci --no-audit --no-fund)
	else
		echo "==> 依赖已存在，跳过 npm ci（需要重装时删除 node_modules 后重跑）"
	fi
fi

# WorkBuddy 沙箱的 fs shim 在 CopyPlugin 并发 mkdir _locales/<lang> 时会报 EIO。
# 预先建好全部 locale 目录即可绕过；在普通终端里也无害。
mkdir -p "${DIST}/_locales"
for locale_dir in "${REPO}"/src/_locales/*/; do
	[ -d "${locale_dir}" ] || continue
	mkdir -p "${DIST}/_locales/$(basename "${locale_dir}")"
done

echo "==> 构建 Chrome 扩展"
(cd "${REPO}" && npm run build:chrome)

echo "==> 校验产物"
test -f "${DIST}/manifest.json" || { echo "缺少 manifest.json" >&2; exit 1; }
test -f "${DIST}/popup.js" || { echo "缺少 popup.js" >&2; exit 1; }
test -f "${DIST}/settings.js" || { echo "缺少 settings.js" >&2; exit 1; }
if ! grep -q "createMarkdown" "${DIST}/popup.js"; then
	echo "popup.js 中未找到 DEVONthink 命令，构建可能用了旧代码" >&2
	exit 1
fi
if ! grep -q "devonthink-format" "${DIST}/popup.js"; then
	echo "popup.js 中未找到格式切换控件，构建可能用了旧代码" >&2
	exit 1
fi
if ! grep -q "devonthink-destination-input" "${DIST}/settings.js"; then
	echo "settings.js 中未找到 DEVONthink 设置项，构建可能用了旧代码" >&2
	exit 1
fi

if [ "${DO_SYNC}" -eq 1 ] && [ -n "${EDGE_DIR}" ]; then
	if [ -d "${EDGE_DIR}" ]; then
		echo "==> 同步到加载目录: ${EDGE_DIR}"
		# Use in-place copies instead of rsync's atomic replace: on some
		# systems rsync's delete/rename is blocked and leaves hidden
		# .<file>.<random> temp files behind. cp -f overwrites in place.
		while IFS= read -r -d '' src_file; do
			rel="${src_file#${DIST}/}"
			cp -f "${src_file}" "${EDGE_DIR}/${rel}"
		done < <(find "${DIST}" -type f -print0)
	else
		echo "==> 警告: 加载目录不存在，跳过同步: ${EDGE_DIR}" >&2
	fi
fi

echo "==> 构建完成"
echo "    扩展目录: ${DIST}"
ZIP="$(ls -t "${REPO}"/builds/*-chrome.zip 2>/dev/null | head -n 1 || true)"
if [ -n "${ZIP}" ]; then
	echo "    打包文件: ${ZIP}"
fi
if [ "${DO_SYNC}" -eq 1 ] && [ -n "${EDGE_DIR}" ] && [ -d "${EDGE_DIR}" ]; then
	echo "    已同步到: ${EDGE_DIR}"
fi
