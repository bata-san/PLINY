import { handleLogin, handleRegister } from '../api.js';
import { showAuthMessage } from './ui.js';

export function bindAuthEvents(initializeAppCallback) {
    const loginForm = document.getElementById("login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", (e) => handleLogin(e, initializeAppCallback));
    }

    const registerForm = document.getElementById("register-form");
    if (registerForm) {
        registerForm.addEventListener("submit", handleRegister);
    }

    const showRegisterBtn = document.getElementById("show-register-form");
    if (showRegisterBtn) {
        showRegisterBtn.addEventListener("click", (e) => {
            e.preventDefault();
            document.getElementById("login-form").style.display = "none";
            document.getElementById("register-form").style.display = "block";
            showAuthMessage("");
        });
    }

    const showLoginBtn = document.getElementById("show-login-form");
    if (showLoginBtn) {
        showLoginBtn.addEventListener("click", (e) => {
            e.preventDefault();
            document.getElementById("register-form").style.display = "none";
            document.getElementById("login-form").style.display = "block";
            showAuthMessage("");
        });
    }
}
