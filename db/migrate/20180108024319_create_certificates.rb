class CreateCertificates < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :certificates do |t|
      t.belongs_to :candidate, index: true
      t.string :title
      t.string :institute
      t.date :start_date
      t.date :end_date
      t.timestamps null: false
    end
  end
end