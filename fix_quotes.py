with open('src/components/auth/OnboardingFlow.tsx', 'r') as f:
    content = f.read()

content = content.replace('Click "Use connected wallet"', 'Click "Use connected wallet"')
content = content.replace('"Use connected wallet"', '"Use connected wallet"')

with open('src/components/auth/OnboardingFlow.tsx', 'w') as f:
    f.write(content)