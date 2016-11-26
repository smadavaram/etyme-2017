class CreateSubcriptions < ActiveRecord::Migration
  def change
    create_table :subscriptions do |t|
      t.integer :company_id
      t.integer :package_id
      t.datetime :expiry
      t.integer :status
      t.float :amount

      t.timestamps null: false
    end
  end
end
