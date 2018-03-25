class CreateDesignations < ActiveRecord::Migration[5.1]
  def change
    create_table :designations do |t|
      t.belongs_to :candidate, index: true
      t.string :comp_name
      t.string :recruiter_name
      t.string :recruiter_phone
      t.string :recruiter_email
      t.string :status
      t.timestamps null: false
    end
  end
end