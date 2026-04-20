import { Search } from 'lucide-react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative px-3 py-2.5">
      <Search className="absolute left-5.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#666]" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search contacts..."
        className="w-full rounded-lg border border-[#16213e] bg-[#0f3460] py-2 pl-9 pr-3 text-sm text-[#e0e0e0] placeholder-[#666] outline-none focus:border-[#533483]"
      />
    </div>
  )
}
