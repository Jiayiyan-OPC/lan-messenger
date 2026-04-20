export function App() {
  return (
    <div className="flex h-screen bg-[#0a0a1a] text-[#e2e8f0]">
      {/* Sidebar */}
      <aside className="w-[280px] border-r border-[#16213e] bg-[#1a1a2e] flex flex-col">
        <div className="p-4 text-lg font-semibold border-b border-[#16213e]">
          LAN Messenger
        </div>
        <div className="flex-1 p-4 text-[#94a3b8] text-sm">
          Contacts will appear here
        </div>
      </aside>

      {/* Main area */}
      <main className="flex-1 flex items-center justify-center text-[#94a3b8]">
        <div className="text-center">
          <div className="text-4xl mb-4">💬</div>
          <div>Select a contact to start chatting</div>
        </div>
      </main>
    </div>
  )
}
