package app.loxiro.browser;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Process;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import java.util.ArrayList;
import java.util.LinkedHashSet;

/** A single user-mediated, read-only picker. No camera/storage permissions or native file bridge. */
final class UploadPicker {
    static final int REQUEST=701;
    private final Activity activity;
    private ValueCallback<Uri[]> callback;
    private String owner;
    private boolean inFlight,multiple;
    String status="idle";
    UploadPicker(Activity activity,boolean pending){this.activity=activity;inFlight=pending;}
    boolean pending(){return inFlight;}
    boolean show(String pageId,ValueCallback<Uri[]> result,WebChromeClient.FileChooserParams params){
        if(inFlight){result.onReceiveValue(null);return true;}
        if(params.getMode()!=WebChromeClient.FileChooserParams.MODE_OPEN&&params.getMode()!=WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE){result.onReceiveValue(null);return true;}
        multiple=params.getMode()==WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE;
        Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT);pick.addCategory(Intent.CATEGORY_OPENABLE);pick.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        LinkedHashSet<String> types=new LinkedHashSet<>();
        for(String group:params.getAcceptTypes())for(String item:group.split(",")){
            String type=item.trim().toLowerCase(java.util.Locale.ROOT);
            if(type.startsWith(".")){String mapped=MimeTypeMap.getSingleton().getMimeTypeFromExtension(type.substring(1));type=mapped==null?"*/*":mapped;}
            if(type.matches("[a-z0-9!#$&^_.+*-]+/[a-z0-9!#$&^_.+*-]+")&&types.size()<32)types.add(type);
        }
        if(types.isEmpty())types.add("*/*");
        pick.setType(types.size()==1?types.iterator().next():"*/*");if(types.size()>1)pick.putExtra(Intent.EXTRA_MIME_TYPES,types.toArray(new String[0]));pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,multiple);
        callback=result;owner=pageId;inFlight=true;status="pending";
        try{activity.startActivityForResult(pick,REQUEST);}catch(RuntimeException error){inFlight=false;cancel();}
        return true;
    }
    void cancel(){ValueCallback<Uri[]> previous=callback;callback=null;owner=null;if(previous!=null)previous.onReceiveValue(null);}
    void cancelOwner(String id){if(id.equals(owner))cancel();}
    void result(int code,Intent data){
        inFlight=false;ValueCallback<Uri[]> previous=callback;callback=null;owner=null;if(previous==null)return;
        ArrayList<Uri> selected=new ArrayList<>();
        if(code==Activity.RESULT_OK&&data!=null){
            if(data.getClipData()!=null){for(int i=0;i<Math.min(32,data.getClipData().getItemCount());i++)add(selected,data.getClipData().getItemAt(i).getUri());}
            else add(selected,data.getData());
        }
        if(!selected.isEmpty())status="accepted:"+selected.size();else if(code!=Activity.RESULT_OK)status="cancelled";
        previous.onReceiveValue(selected.isEmpty()?null:selected.toArray(new Uri[0]));
    }
    private void add(ArrayList<Uri> selected,Uri uri){
        if(uri==null||!"content".equals(uri.getScheme())||uri.getAuthority()==null||(!multiple&&!selected.isEmpty())||selected.contains(uri))return;
        // Only the document provider's explicitly granted content, never app-private or file URLs.
        try {
        android.content.pm.ProviderInfo provider=activity.getPackageManager().resolveContentProvider(uri.getAuthority(),0);
        if(provider!=null&&provider.applicationInfo.uid==Process.myUid()){status="rejected:app-owned";return;}
        if(activity.checkUriPermission(uri,Process.myPid(),Process.myUid(),Intent.FLAG_GRANT_READ_URI_PERMISSION)!=PackageManager.PERMISSION_GRANTED){status="rejected:ungranted";return;}
        selected.add(uri);
        }catch(SecurityException|IllegalArgumentException ignored){ /* Unreadable provider result is not a selected file. */ }
    }
}
