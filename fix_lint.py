with open('src/components/auth/OnboardingFlow.tsx', 'r') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'Click "Use connected wallet"' in line:
        lines[i] = line.replace('Click "Use connected wallet"', 'Click "Use connected wallet"')
    if '"Use connected wallet"' in line:
        lines[i] = line.replace('"Use connected wallet"', '"Use connected wallet"')

with open('src/components/auth/OnboardingFlow.tsx', 'w') as f:
    f.writelines(lines)

print('Done')