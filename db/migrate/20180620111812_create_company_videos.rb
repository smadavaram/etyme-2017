class CreateCompanyVideos < ActiveRecord::Migration[4.2][5.1]
  def change
    create_table :company_videos do |t|
      t.integer :company_id
      t.string :video
      t.string :video_type

      t.timestamps
    end
  end
end
