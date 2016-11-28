class CreateCompanyLeaves < ActiveRecord::Migration
  def change
    create_table :company_leaves do |t|
      t.date :from_date
      t.date :till_date
      t.string :reason
      t.string :response_message
      t.integer :status
      t.string :leave_type

      t.timestamps null: false
    end
  end
end
