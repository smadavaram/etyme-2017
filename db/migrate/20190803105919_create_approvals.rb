class CreateApprovals < ActiveRecord::Migration[5.1]
  def change
    create_table :approvals do |t|
      t.bigint :user_id
      t.string :contractable_type
      t.bigint :contractable_id
      t.integer :approvable_type
      t.timestamps
    end
  end
end
