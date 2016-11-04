class CreateEducations < ActiveRecord::Migration
  def change
    create_table :educations do |t|
      t.string :title
      t.string :institute
      t.date   :start_date
      t.date   :end_date
      t.timestamps null: false
    end
  end
end
