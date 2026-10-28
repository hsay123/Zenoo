import re

with open('src/components/auth/OnboardingFlow.tsx', 'r') as f:
    content = f.read()

# Replace literal double quotes with HTML entities
content = re.sub(r'Click "Use connected wallet"', 'Click "Use connected wallet"', content)
content = re.sub(r'"Use connected wallet"', '"Use connected wallet"', content)

with open('src/components/auth/OnboardingFlow.tsx', 'w') as f:
    f.write(content)

print('Done')