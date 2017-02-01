class CreateGroups < ActiveRecord::Migration
  def change
    create_table :groups do |t|
      t.string :group_name
      t.integer :company_id ,  index: true
      t.timestamps null: false
    end
    create_table :candidates_groups , id: false do |t|
      t.belongs_to :group , index: true
      t.belongs_to :candidate ,  index: true
    end

  end
end
