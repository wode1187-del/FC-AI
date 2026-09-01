import React from 'react';

// AppContainer: 应用容器
export function AppContainer({ children }) {
  return React.createElement('div', { className: 'app-container' }, children);
}

// ErrorRender: 错误渲染
export function ErrorRender({ error, resetErrorBoundary }) {
  return React.createElement('div', {
    style: {
      padding: '20px',
      margin: '20px',
      border: '1px solid #ff4d4f',
      borderRadius: '8px',
      background: '#fff2f0',
      fontFamily: 'system-ui, sans-serif'
    }
  },
    React.createElement('h2', { style: { color: '#ff4d4f', marginTop: 0 } }, '应用出错了'),
    React.createElement('pre', { style: { 
      background: '#fff', 
      padding: '10px', 
      borderRadius: '4px',
      overflow: 'auto',
      maxHeight: '300px'
    } }, error?.message || String(error)),
    React.createElement('button', {
      onClick: resetErrorBoundary,
      style: {
        marginTop: '10px',
        padding: '8px 16px',
        background: '#1677ff',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      }
    }, '重试')
  );
}

// logger: 日志工具
export const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  debug: (...args) => console.debug('[DEBUG]', ...args),
  log: (...args) => console.log('[LOG]', ...args),
};

// scopedStorage: 作用域存储（封装localStorage，使用getItem/setItem方法）
const STORAGE_PREFIX = 'fc_ai_workbench_';

export const scopedStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(STORAGE_PREFIX + key);
    } catch (e) {
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, value);
      return true;
    } catch (e) {
      return false;
    }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(STORAGE_PREFIX + key);
      return true;
    } catch (e) {
      return false;
    }
  },
  clear() {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(STORAGE_PREFIX))
        .forEach(k => localStorage.removeItem(k));
      return true;
    } catch (e) {
      return false;
    }
  },
  // 别名兼容
  get(key) { return this.getItem(key); },
  set(key, value) { return this.setItem(key, value); },
  remove(key) { return this.removeItem(key); },
};

export default { AppContainer, ErrorRender, logger, scopedStorage };
