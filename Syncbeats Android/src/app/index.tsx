import { Redirect } from 'expo-router';
import { useSession } from '../session/SessionProvider';
export default function Index() { return <Redirect href={useSession().user ? '/home' : '/login'} />; }
