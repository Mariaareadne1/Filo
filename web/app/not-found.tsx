export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-5xl mb-4">🗺️</p>
        <h1 className="text-2xl font-black text-gray-900 mb-2">Board not found</h1>
        <p className="text-gray-500 text-sm mb-6">
          This board may be private, deleted, or the link may be wrong.
        </p>
        <a
          href="https://apps.apple.com/app/filo"
          className="inline-block bg-red-500 text-white font-bold px-6 py-3 rounded-xl hover:bg-red-600 transition-colors"
        >
          Get Filo
        </a>
      </div>
    </div>
  );
}
