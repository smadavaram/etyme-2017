class CreateJobs < ActiveRecord::Migration[4.2]
  def change
    create_table :jobs do |t|
      t.string   :title
      t.text     :description
      t.integer  :location_id
      t.date     :start_date
      t.date     :end_date
      t.integer  :parent_job_id
      t.integer  :company_id
      t.integer  :created_by_id

      t.timestamps null: false
    end
  end
end
