class CreateJobs < ActiveRecord::Migration
  def change
    create_table :jobs do |t|
      t.string   :title
      t.text     :description
      t.string   :country
      t.string   :zip_code
      t.string   :state
      t.string   :city
      t.date     :start_date
      t.date     :end_date
      t.integer  :user_id

      t.timestamps null: false
    end
  end
end
