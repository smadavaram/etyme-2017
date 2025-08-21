class CreateMessages < ActiveRecord::Migration[4.2]
  def change
    create_table :messages do |t|
      t.string  :body
      t.belongs_to :chat
      t.references :messageable, polymorphic: true, index: true
      t.timestamps null: false
    end
  end
end
