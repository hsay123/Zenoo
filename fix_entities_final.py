with open('src/components/auth/OnboardingFlow.tsx', 'r') as f:
    content = f.read()

# Find the exact line with the issue
lines = content.split('\n')
for i, line in enumerate(lines):
    if 'Use connected wallet' in line and 'Click' in line:
        print(f'Line {i}: {repr(line)}')
        for j, ch in enumerate(line):
            if ch == '"':
                print(f'  Quote at position {j}')

# The line is at index 475 (0-indexed)
line = lines[475]
print(f'Line 475: {repr(line)}')

# Replace double quotes at positions 32 and 53 with "
new_line = line[:32] + '"' + line[33:53] + '"' + line[54:]
lines[475] = new_line

content = '\n'.join(lines)

with open('src/components/auth/OnboardingFlow.tsx', 'w') as f:
    f.write(content)

print('Done')