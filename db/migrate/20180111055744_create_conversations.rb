class CreateConversations < ActiveRecord::Migration[5.1]
  def change
    create_table :conversations do |t|
      t.references :senderable, polymorphic: true, index: true
      t.references :recipientable, polymorphic: true, index: true
      t.string :topic

      t.timestamps
    end
  end
end
