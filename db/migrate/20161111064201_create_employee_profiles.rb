class CreateEmployeeProfiles < ActiveRecord::Migration
  def change
    create_table :employee_profiles do |t|
      t.integer  :employee_id , index: true
      t.string   :designation
      t.date     :joining_date
      t.integer  :location_id
      t.integer  :employment_type
      t.integer  :salary_type
      t.float    :salary

      t.timestamps null: false
    end

    create_table :roles_users , id: false do |t|
      t.integer :role_id
      t.integer :user_id
    end

  end
end
