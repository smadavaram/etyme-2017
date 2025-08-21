class CreateConversationMutes < ActiveRecord::Migration[5.1]
  def change
    create_table :conversation_mutes do |t|
      t.belongs_to :conversation, index: true
      t.belongs_to :mutable, index: true, polymorphic: true

      t.timestamps
    end
  end
end
