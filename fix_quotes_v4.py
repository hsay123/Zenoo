with open('src/components/auth/OnboardingFlow.tsx', 'r') as f:
    content = f.read()

# Replace literal double quotes with HTML entities in the specific lines
# Find and replace the double quote characters
lines = content.split('\n')
for i, line in enumerate(lines):
    if 'Click "Use connected wallet"' in line:
        lines[i] = line.replace('"', '"')
    elif '"Use connected wallet"' in line:
        lines[i] = line.replace('"', '"')

content = '\n'.join(lines)

with open('src/components/auth/OnboardingFlow.tsx', 'w') as f:
    f.write(content)

print('Done')