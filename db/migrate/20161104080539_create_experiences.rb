class CreateExperiences < ActiveRecord::Migration
  def change
    create_table :experiences do |t|
      t.string :title
      t.text   :description
      t.string :company_name
      t.date   :start_date
      t.date   :end_date

      t.timestamps null: false
    end
  end
end
