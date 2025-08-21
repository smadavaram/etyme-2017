class CreateJobRequirements < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :job_requirements do |t|
      t.belongs_to :job, index: true
      t.text :questions
      t.string :ans_type
      t.boolean :ans_mandatroy
      t.boolean :multiple_ans
      t.string :multiple_option
      t.timestamps
    end
  end
end
