class CreateEducations < ActiveRecord::Migration
  def change
    create_table :educations do |t|
      t.string   :degree_title
      t.string   :grade
      t.date     :completion_year
      t.date     :start_year
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
