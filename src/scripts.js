// 页面加载动画
document.addEventListener('DOMContentLoaded', () => {
    document.body.style.opacity = '0';
    setTimeout(() => {
        document.body.style.transition = 'opacity 1s ease';
        document.body.style.opacity = '1';
    }, 100);
});

// 平滑滚动功能
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
    });
});

// 导航栏滚动监听
const header = document.querySelector('header');
const navHeight = header.offsetHeight;

window.addEventListener('scroll', () => {
    if (window.scrollY > navHeight) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
});

// 按钮点击效果
const ctaButton = document.querySelector('.cta-button');
if (ctaButton) {
    ctaButton.addEventListener('click', (e) => {
        e.preventDefault();
        ctaButton.classList.add('clicked');
        setTimeout(() => {
            ctaButton.classList.remove('clicked');
        }, 300);
    });
}

// 响应式导航栏切换
const navToggle = document.createElement('button');
navToggle.className = 'nav-toggle';
navToggle.innerHTML = '&#9776;';
document.querySelector('nav').prepend(navToggle);

navToggle.addEventListener('click', () => {
    document.querySelector('nav ul').classList.toggle('active');
});
