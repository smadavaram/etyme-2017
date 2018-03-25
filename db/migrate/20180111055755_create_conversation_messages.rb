class CreateConversationMessages < ActiveRecord::Migration[5.1]
  def change
    create_table :conversation_messages do |t|
      t.text :body
      t.boolean :is_read, default: :false
      t.belongs_to :conversation, index: true
      t.references :userable, polymorphic: true, index: true

      t.timestamps
    end
  end
end
