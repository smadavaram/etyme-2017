module Company::AttachmentsHelper
  def image_type attachable
    type = attachable.file_type
     if(type =='image/jpeg'|| type=='image/png')
       return attachable.file
     elsif (type =='text/plain')
       return 'text_image.jpg'
     elsif (type=='application/pdf')
       return 'Acrobat-icon.png'
     end
  end
end
