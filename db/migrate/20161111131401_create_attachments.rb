class CreateAttachments < ActiveRecord::Migration[4.2]
  def change
    create_table :attachments do |t|

      t.string  :file
      t.string  :file_name
      t.integer :file_size
      t.integer :file_type
      t.string  :attachable_type
      t.integer :attachable_id

      t.timestamps null: false
    end
  end
end
