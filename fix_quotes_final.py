with open('src/components/auth/OnboardingFlow.tsx', 'r') as f:
    lines = f.readlines()

# Fix line 475 (0-indexed: 474)
if 'Click "Use connected wallet" to auto-fill your address' in lines[475]:
    lines[475] = lines[475].replace('Click "Use connected wallet"', 'Click "Use connected wallet"')

# Fix line 485 (0-indexed: 484) - the button text
if 'Use connected wallet' in lines[485] and lines[485].strip() == 'Use connected wallet':
    # This line is just the button text, no quotes to fix
    pass
elif '"Use connected wallet"' in lines[485]:
    lines[485] = lines[485].replace('"Use connected wallet"', '"Use connected wallet"')

with open('src/components/auth/OnboardingFlow.tsx', 'w') as f:
    f.writelines(lines)

print('Done')