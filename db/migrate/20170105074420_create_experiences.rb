class CreateExperiences < ActiveRecord::Migration
  def change
    create_table :experiences do |t|
      t.string   :experience_title
      t.date     :start_date
      t.date     :end_date
      t.string   :institute
      t.integer  :status
      t.text     :description
      t.integer  :user_id



      t.datetime "created_at"
      t.datetime "updated_at"

      t.timestamps null: false
    end
  end
end
