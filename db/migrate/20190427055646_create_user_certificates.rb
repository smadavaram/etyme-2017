class CreateUserCertificates < ActiveRecord::Migration[5.1]
  def change
    create_table :user_certificates do |t|
      t.belongs_to :user, index: true
      t.date     :end_date
      t.date     :start_date
      t.string   :institute
      t.string   :title

      t.timestamps
    end
  end
end
