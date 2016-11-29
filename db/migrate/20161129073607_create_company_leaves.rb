class CreateCompanyLeaves < ActiveRecord::Migration
  def change
    create_table :leaves do |t|
      t.date    :from_date
      t.date    :till_date
      t.string  :reason
      t.string  :response_message
      t.integer :status ,default: 0
      t.string  :leave_type
      t.integer :user_id

      t.timestamps null: false
    end
  end
end
