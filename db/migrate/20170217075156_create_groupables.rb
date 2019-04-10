class CreateGroupables < ActiveRecord::Migration[4.2]
  def change
    create_table :groupables do |t|
      t.belongs_to :group
      t.references :groupable, polymorphic: true, index: true
      t.timestamps null: false
    end
  end
end
