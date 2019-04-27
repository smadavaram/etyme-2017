class CreateUserWorkClients < ActiveRecord::Migration[5.1]
  def change
    create_table :user_work_clients do |t|
      t.belongs_to :user, index: true
      t.string   :name
      t.string   :industry
      t.date     :end_date
      t.date     :start_date
      t.string   :reference_name
      t.string   :reference_phone
      t.string   :reference_email
      t.text   :project_description
      t.text   :role

      t.timestamps
    end
  end
end
