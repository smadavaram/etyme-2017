class CreateConsultantProfiles < ActiveRecord::Migration[4.2]


  def change
    create_table :consultant_profiles do |t|
      t.integer  :consultant_id , index: true
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
