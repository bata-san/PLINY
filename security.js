/* ===============================================
 * セキュリティ強化機能 - エンタープライズグレード
 * =============================================== */

// セキュリティモジュール
const SecurityModule = {
    // CSRF保護
    generateCSRFToken() {
        return 'csrf_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    },

    // レート制限
    rateLimiter: {
        attempts: new Map(),
        
        isAllowed(identifier, maxAttempts = 5, timeWindow = 15 * 60 * 1000) {
            const now = Date.now();
            const userAttempts = this.attempts.get(identifier) || [];
            
            // 時間窓外の試行を削除
            const recentAttempts = userAttempts.filter(timestamp => now - timestamp < timeWindow);
            
            this.attempts.set(identifier, recentAttempts);
            
            return recentAttempts.length < maxAttempts;
        },
        
        recordAttempt(identifier) {
            const userAttempts = this.attempts.get(identifier) || [];
            userAttempts.push(Date.now());
            this.attempts.set(identifier, userAttempts);
        }
    },

    // パスワード強度チェッカー
    checkPasswordStrength(password) {
        const checks = {
            length: password.length >= 8,
            hasUppercase: /[A-Z]/.test(password),
            hasLowercase: /[a-z]/.test(password),
            hasNumbers: /\d/.test(password),
            hasSpecialChars: /[!@#$%^&*(),.?":{}|<>]/.test(password),
            noCommonPatterns: !this.isCommonPassword(password),
            noSequential: !this.hasSequentialChars(password)
        };
        
        const score = Object.values(checks).filter(Boolean).length;
        
        return {
            score,
            checks,
            level: this.getStrengthLevel(score),
            recommendations: this.getPasswordRecommendations(checks)
        };
    },

    isCommonPassword(password) {
        const common = [
            'password', '12345678', 'qwerty', 'abc123', 
            'password123', 'admin', 'letmein', 'welcome',
            'monkey', '123456789', 'password1'
        ];
        return common.includes(password.toLowerCase());
    },

    hasSequentialChars(password) {
        const sequences = ['123', 'abc', 'qwe'];
        return sequences.some(seq => password.toLowerCase().includes(seq));
    },

    getStrengthLevel(score) {
        if (score <= 2) return { level: 'very-weak', text: '非常に弱い', color: '#dc3545' };
        if (score <= 3) return { level: 'weak', text: '弱い', color: '#fd7e14' };
        if (score <= 4) return { level: 'medium', text: '普通', color: '#ffc107' };
        if (score <= 5) return { level: 'strong', text: '強い', color: '#20c997' };
        return { level: 'very-strong', text: '非常に強い', color: '#28a745' };
    },

    getPasswordRecommendations(checks) {
        const recommendations = [];
        
        if (!checks.length) recommendations.push('8文字以上にしてください');
        if (!checks.hasUppercase) recommendations.push('大文字を含めてください');
        if (!checks.hasLowercase) recommendations.push('小文字を含めてください');
        if (!checks.hasNumbers) recommendations.push('数字を含めてください');
        if (!checks.hasSpecialChars) recommendations.push('特殊文字を含めてください');
        if (!checks.noCommonPatterns) recommendations.push('よく使われるパスワードは避けてください');
        if (!checks.noSequential) recommendations.push('連続した文字は避けてください');
        
        return recommendations;
    },

    // セッション管理
    sessionManager: {
        startSession(token, rememberMe = false) {
            const expirationTime = rememberMe ? 
                Date.now() + (30 * 24 * 60 * 60 * 1000) : // 30日
                Date.now() + (8 * 60 * 60 * 1000); // 8時間
            
            localStorage.setItem('pliny_session_expires', expirationTime.toString());
            localStorage.setItem('pliny_session_start', Date.now().toString());
            
            // セッション更新のタイマーを設定
            this.scheduleTokenRefresh(token);
        },

        isSessionValid() {
            const expirationTime = localStorage.getItem('pliny_session_expires');
            if (!expirationTime) return false;
            
            return Date.now() < parseInt(expirationTime);
        },

        extendSession() {
            const expirationTime = localStorage.getItem('pliny_session_expires');
            if (expirationTime) {
                const newExpiration = Date.now() + (8 * 60 * 60 * 1000); // 8時間延長
                localStorage.setItem('pliny_session_expires', newExpiration.toString());
            }
        },

        scheduleTokenRefresh(token) {
            // 7時間後にトークンを更新（8時間の有効期限の1時間前）
            setTimeout(() => {
                this.refreshToken(token);
            }, 7 * 60 * 60 * 1000);
        },

        async refreshToken(currentToken) {
            try {
                const response = await fetch(`${WORKER_URL}/api/auth/refresh`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${currentToken}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    const result = await response.json();
                    localStorage.setItem('pliny_auth_token', result.token);
                    this.scheduleTokenRefresh(result.token);
                }
            } catch (error) {
                console.error('Token refresh failed:', error);
                // トークン更新に失敗した場合、ユーザーを再ログインさせる
                this.handleTokenExpiration();
            }
        },

        handleTokenExpiration() {
            // 認証情報をクリア
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('pliny_')) {
                    localStorage.removeItem(key);
                }
            });

            // ユーザーに通知
            if (typeof showAuthError === 'function') {
                showAuthError('セッション期限切れ', 'セキュリティのため再ログインが必要です');
            }

            // 認証画面に戻る
            if (typeof showAuthInterface === 'function') {
                showAuthInterface();
            }
        }
    },

    // 入力値のサニタイゼーション
    sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        
        return input
            .replace(/[<>]/g, '') // HTMLタグを除去
            .trim() // 前後の空白を除去
            .substring(0, 500); // 最大長制限
    },

    // メール検証の強化
    validateEmailFormat(email) {
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        
        if (!emailRegex.test(email)) return false;
        if (email.length > 254) return false; // RFC 5321 制限
        
        const parts = email.split('@');
        if (parts[0].length > 64) return false; // ローカル部の制限
        
        return true;
    },

    // ブルートフォース攻撃対策
    bruteForceProtection: {
        failures: new Map(),
        
        recordFailure(identifier) {
            const failures = this.failures.get(identifier) || 0;
            this.failures.set(identifier, failures + 1);
            
            // 一定回数失敗したらロックアウト
            if (failures >= 5) {
                this.lockAccount(identifier);
            }
        },
        
        lockAccount(identifier) {
            const lockTime = Date.now() + (30 * 60 * 1000); // 30分ロック
            localStorage.setItem(`account_locked_${identifier}`, lockTime.toString());
        },
        
        isAccountLocked(identifier) {
            const lockTime = localStorage.getItem(`account_locked_${identifier}`);
            if (!lockTime) return false;
            
            if (Date.now() > parseInt(lockTime)) {
                localStorage.removeItem(`account_locked_${identifier}`);
                this.failures.delete(identifier);
                return false;
            }
            
            return true;
        },
        
        clearFailures(identifier) {
            this.failures.delete(identifier);
            localStorage.removeItem(`account_locked_${identifier}`);
        }
    }
};

// セキュリティ機能の統合
function enhanceAuthSecurity() {
    // セッション監視
    setInterval(() => {
        if (!SecurityModule.sessionManager.isSessionValid()) {
            SecurityModule.sessionManager.handleTokenExpiration();
        }
    }, 60000); // 1分ごとにチェック

    // アクティビティ監視
    let lastActivity = Date.now();
    
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(event => {
        document.addEventListener(event, () => {
            lastActivity = Date.now();
            SecurityModule.sessionManager.extendSession();
        }, { passive: true });
    });

    // 30分間非アクティブの場合は警告
    setInterval(() => {
        if (Date.now() - lastActivity > 30 * 60 * 1000) {
            if (typeof showAuthError === 'function') {
                showAuthError('セッション警告', '30分間非アクティブでした。セキュリティのため間もなくログアウトされます');
            }
        }
    }, 5 * 60 * 1000); // 5分ごとにチェック
}

// セキュリティ機能を初期化
document.addEventListener('DOMContentLoaded', () => {
    enhanceAuthSecurity();
});

export default SecurityModule;
