with open('src/components/auth/OnboardingFlow.tsx', 'r') as f:
    lines = f.readlines()

# Fix line 475 (index 475) - replace double quotes at positions 32 and 53 with "
line = lines[475]
new_line = line[:32] + '"' + line[33:53] + '"' + line[54:]
lines[475] = new_line

# Fix line 485 if it has double quotes
if '"Use connected wallet"' in lines[485]:
    lines[485] = lines[485].replace('"Use connected wallet"', '"Use connected wallet"')

with open('src/components/auth/OnboardingFlow.tsx', 'w') as f:
    f.writelines(lines)

print('Done')