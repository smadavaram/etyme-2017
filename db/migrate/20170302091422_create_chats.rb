class CreateChats < ActiveRecord::Migration[4.2]
  def change
    create_table :chats do |t|
      t.string :slug
      t.references :chatable, polymorphic: true, index: true
      t.timestamps null: false
    end
  end
end
