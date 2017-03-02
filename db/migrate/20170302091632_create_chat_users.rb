class CreateChatUsers < ActiveRecord::Migration
  def change
    create_table :chat_users do |t|
      t.belongs_to :chat
      t.integer    :status
      t.references :userable, polymorphic: true, index: true
      t.timestamps null: false
    end
    add_index :chat_users, [:chat_id, :userable_id,:userable_type] ,unique: :true
  end
end
