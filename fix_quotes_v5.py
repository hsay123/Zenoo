with open('src/components/auth/OnboardingFlow.tsx', 'r') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    # Line with "Click "Use connected wallet" to auto-fill your address."
    if 'Click "Use connected wallet" to auto-fill your address' in line:
        # Replace only the double quotes around "Use connected wallet"
        line = line.replace('Click "Use connected wallet"', 'Click "Use connected wallet"')
        lines[i] = line
    # Line with "Use connected wallet" (button text)
    elif line.strip() == 'Use connected wallet' or 'Use connected wallet' in line:
        if '"Use connected wallet"' in line:
            line = line.replace('"Use connected wallet"', '"Use connected wallet"')
            lines[i] = line

with open('src/components/auth/OnboardingFlow.tsx', 'w') as f:
    f.writelines(lines)

print('Done')