class CreateUserEducations < ActiveRecord::Migration[5.1]
  def change
    create_table :user_educations do |t|
      t.belongs_to :user, index: true
      t.string   :degree_level
      t.string   :degree_title
      t.string   :cgpa_grade
      t.date     :completion_year
      t.date     :start_year
      t.string   :institute

      t.timestamps
    end
  end
end
