class CreateShareLinkPreviews < ActiveRecord::Migration[5.2]
  def change
    create_table :share_link_previews do |t|
      t.references :company
      t.references :user
      t.string :url, unique: true
      t.string :key, unique: true
      t.string :preview

      t.timestamps
    end
  end
end
