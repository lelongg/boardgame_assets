import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Italic, Type } from 'lucide-react'
import { useState, useEffect } from 'react'

type RichTextFieldProps = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

export default function RichTextField({ value, onChange }: RichTextFieldProps) {
  const [showToolbar, setShowToolbar] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        horizontalRule: false,
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[1.5rem]',
      },
    },
  })

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value)
    }
  }, [value, editor])

  if (!editor) return null

  return (
    <div className="relative rounded-md border bg-background px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-ring">
      <div className="pr-7">
        <EditorContent editor={editor} />
      </div>
      <button
        type="button"
        className={`absolute right-1 top-1.5 p-1 rounded-sm transition-colors ${
          showToolbar ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => setShowToolbar(!showToolbar)}
        title="Formatting"
      >
        <Type className="h-4 w-4" />
      </button>
      {showToolbar && (
        <div className="flex gap-0.5 mt-2 pt-2 border-t">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`rounded p-1.5 transition-colors ${
              editor.isActive('bold')
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            }`}
            title="Bold"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`rounded p-1.5 transition-colors ${
              editor.isActive('italic')
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            }`}
            title="Italic"
          >
            <Italic className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
