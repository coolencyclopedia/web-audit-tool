# Web Audit Tool

A full-stack website audit tool that analyzes SEO and security issues of public websites.

## Tech Stack
- Vanilla JavaScript
- Cloudflare Pages
- Cloudflare Workers
- GitHub

## Features
- SEO checks (title, meta description)
- Security header analysis
- Secure backend URL fetching
- Rate limiting
- Hidden backend logic

## Live Demo
👉 https://web-audit-tool.pages.dev/

## Architecture
Frontend is served via Cloudflare Pages.  
API requests to `/api/audit` are proxied to a Cloudflare Worker.

## Why this project
Built to demonstrate real-world full-stack architecture, security, and performance.
