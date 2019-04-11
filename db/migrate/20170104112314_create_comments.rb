class CreateComments < ActiveRecord::Migration[4.2]
  def change
    create_table :comments do |t|
      t.string :body
      t.integer :commentable_id
      t.string :commentable_type
      t.integer :created_by_id , foreign_key: true , index: true
      t.timestamps null: false
    end
  end
end
