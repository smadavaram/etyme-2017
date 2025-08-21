class CreateSalaryItems < ActiveRecord::Migration[5.1]
  def change
    create_table :salary_items do |t|
      t.string :salaryable_type
      t.bigint :salaryable_id
      t.bigint :salary_id
    end
  end
end
