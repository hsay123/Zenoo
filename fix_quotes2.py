with open('src/components/auth/OnboardingFlow.tsx', 'r') as f:
    content = f.read()

# Replace double quotes with HTML entities
content = content.replace('Click "Use connected wallet"', 'Click "Use connected wallet"')
content = content.replace('"Use connected wallet"', '"Use connected wallet"')

with open('src/components/auth/OnboardingFlow.tsx', 'w') as f:
    f.write(content)

print("Done")